import { SSMClient } from '@aws-sdk/client-ssm'
import 'dotenv/config'
import { getAllFromParametersStore, paramStoreConvertParams } from './utils.js'

const ssmClient = new SSMClient({ region: 'ap-southeast-1' })
const rawParams = await getAllFromParametersStore(
  ssmClient,
  `/archoj/production`
)
const params = paramStoreConvertParams(rawParams)

export const config = {
  backendUrl: params.APIGATEWAY_URL,
  userPoolId: params.COGNITO_USER_POOL_ID,
  userPoolClientId: params.COGNITO_USER_POOL_CLIENT_ID,
  groupName: params.COGNITO_GROUP_NAME,
  problemTableName: params.DYNAMODB_PROBLEM_TABLE_NAME,
  submissionTableName: params.DYNAMODB_SUBMISSION_TABLE_NAME,
  workspaceTableName: params.DYNAMODB_WORKSPACE_TABLE_NAME,
  statisticTableName: params.DYNAMODB_STATISTIC_TABLE_NAME,
  instanceType: params.CLOUD9_INSTANCE_TYPE,
  imageId: params.CLOUD9_IMAGE_ID,
  queueUrl: params.SQS_QUEUE_URL,
  iamUserPath: params.IAM_USER_PATH,
}
