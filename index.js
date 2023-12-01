import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'
import {
  DynamoDBDocument,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import axios from 'axios'
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async'
import { config } from './config.js'

const sqsClient = new SQSClient({
  region: 'ap-southeast-1',
})
const dynamoClient = new DynamoDBClient({
  region: 'ap-southeast-1',
})
const dynamoDocument = DynamoDBDocument.from(dynamoClient)

/**
 * @param {string} languageName
 * @returns {number}
 */
function getLanguageIdByName(languageName) {
  const languages = {
    c: 50,
    cpp: 54,
    javascript: 63,
    python: 71,
  }
  return languages[languageName]
}

/**
 * @param {string} submissionId
 * @returns {Record<string, any>}
 */
async function getSubmissionById(submissionId) {
  const command = new GetCommand({
    TableName: config.submissionTableName,
    Key: {
      id: submissionId,
    },
  })
  const { Item } = await dynamoDocument.send(command)
  if (Item == null) {
    throw new Error('Submission not found')
  }
  return Item
}

/**
 * @param {string} problemId
 * @returns {Record<string, any>[]}
 */
async function getTestcasesByProblemId(problemId) {
  const command = new GetCommand({
    TableName: config.problemTableName,
    Key: { id: problemId },
    ProjectionExpression: '#testcases',
    ExpressionAttributeNames: { '#testcases': 'testcases' },
  })
  const { Item: problem } = await dynamoDocument.send(command)

  const { testcases } = problem
  return testcases.filter((testcase) => !testcase.isSample)
}

async function getSubmissionsFromJudgeHost(tokens) {
  let count = 0

  await new Promise(async (resolve) => {
    const interval = setIntervalAsync(async () => {
      if (count++ === 5) {
        ;(async () => {
          await clearIntervalAsync(interval)
        })()
      }
      const { status, data } = await axios.get(
        `http://localhost:2358/submissions/batch`,
        {
          params: { tokens },
        }
      )
      if (status === 200) {
        resolve()
        return data.submissions
      }
    }, 3000)

    await clearIntervalAsync(interval)
  })

  return null
}

async function receiveMessage() {
  try {
    // Receive message from SQS
    const receiveCommand = new ReceiveMessageCommand({
      AttributeNames: ['SentTimestamp'],
      MaxNumberOfMessages: 1,
      MessageAttributeNames: ['All'],
      QueueUrl: config.queueUrl,
      VisibilityTimeout: 20,
      WaitTimeSeconds: 1,
    })
    const { Messages } = await sqsClient.send(receiveCommand)
    if (Messages == null) return

    for (const message of Messages) {
      console.log(`Message received at ${new Date(Date.now()).toISOString()}`)
      console.log(message.Body)

      // Delete message from SQS
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: config.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      })
      await sqsClient.send(deleteCommand)

      const { submissionId } = JSON.parse(message.Body)
      const submission = await getSubmissionById(submissionId)
      if (submission.status === true) return

      const languageId = getLanguageIdByName(submission.language)
      const testcases = await getTestcasesByProblemId(submission.problemId)
      const pendingSubmissions = testcases.map((testcase) => {
        return {
          source_code: submission.code,
          language_id: languageId,
          stdin: testcase.input,
          expected_output: testcase.output,
          enable_network: false,
        }
      })

      const { data } = await axios
        .post(`http://localhost:2358/submissions/batch`, {
          submissions: pendingSubmissions,
        })
        .then((res) => res)
        .catch((err) => {
          console.log(err.response.statusText)
          console.log(err.response.data.error)
        })

      const tokens = data
        .filter((datum) => datum.token != null)
        .map((datum) => datum.token)

      let submissions = await getSubmissionsFromJudgeHost(tokens)

      let result = ''
      for (const submission of submissions) {
        console.log(submission)
        if (submission.status.description !== 'Accepted') {
          result = submission.status.description
          break
        }
      }
      if (result === '') result = 'Accepted'

      // Update record
      const updateCommand = new UpdateCommand({
        TableName: config.submissionTableName,
        Key: {
          id: submission.id,
        },
        UpdateExpression: 'SET #status = :status, #result = :result',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#result': 'result',
        },
        ExpressionAttributeValues: {
          ':status': true,
          ':result': result,
        },
        ReturnValues: 'ALL_NEW',
      })
      await dynamoDocument.send(updateCommand)

      console.log('Finished')
    }
  } catch (err) {
    console.log(err)
    return
  }
}

// entrypoint
const handler = () => {
  console.clear()
  console.log('receiver started.')
  console.log(config)
  setInterval(async () => {
    await receiveMessage()
  }, 3000)
}

handler()
