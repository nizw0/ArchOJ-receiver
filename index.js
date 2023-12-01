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
    c: 7,
    cpp: 12,
    javascript: 26,
    python: 38,
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
  return [testcases].filter((testcase) => !testcase.isSample)
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

    for (const message of Messages) {
      console.log(`Message received at ${Date.now().toLocaleString()}`)
      console.log(message.Body)

      const { submissionId } = JSON.parse(message.Body)
      const submission = getSubmissionById(submissionId)
      const languageId = getLanguageIdByName(submission.language)
      const testcases = getTestcasesByProblemId(submission.problemId)

      const { data } = await axios.post(
        `http://${config.judgeHostDnsName}:2358/submissions/batch`,
        testcases
          .filter((testcase) => !testcase.isSample)
          .map((testcase) => {
            return {
              source_code: submission.code,
              language_id: languageId,
              stdin: testcase.input,
              expected_output: testcase.output,
              enable_network: false,
            }
          })
      )
      const tokens = data
        .filter((datum) => datum.token != null)
        .map((datum) => datum.token)

      // Delete message from SQS
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: config.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      })
      const { $metadata } = await sqsClient.send(deleteCommand)
      console.log($metadata)

      let count = 0
      let submissions = []
      const interval = setInterval(async () => {
        if (count++ === 5) clearInterval(interval)
        const { status, data } = await axios.get(
          `http://${config.judgeHostDnsName}:2358/submissions/batch`,
          {
            params: { tokens },
          }
        )
        if (status == 200) submissions = data.submissions
      }, 3000)

      let result = ''
      for (const submission of submissions) {
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
      const { Attributes } = await dynamoDocument.send(updateCommand)

      console.log(Attributes)
      console.log('Finished')
    }
  } catch (err) {
    console.log(err)
    return
  }
}

// entrypoint
const handler = async () => {
  console.clear()
  console.log('receiver started.')
  console.log(config)
  setInterval(async () => {
    await receiveMessage()
  }, 10000)
}

handler()
