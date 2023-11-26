import { SSMClient } from '@aws-sdk/client-ssm'
import 'dotenv/config'
import { getAllFromParametersStore, paramStoreConvertParams } from './utils.js'

const ssmClient = new SSMClient({
  region: process.env.REGION,
})

const rawParams = await getAllFromParametersStore(
  ssmClient,
  `${process.env.SSM_PATH}/${process.env.NODE_ENV}`
)
const params = paramStoreConvertParams(rawParams) ?? {}

export const config = {
  region: process.env.REGION,
  userPoolId: params.COGNITO_USER_POOL_ID ?? process.env.COGNITO_USER_POOL_ID,
  userPoolClientId:
    params.COGNITO_USER_POOL_CLIENT_ID ??
    process.env.COGNITO_USER_POOL_CLIENT_ID,
  problemTableName:
    params.DYNAMODB_PROBLEM_TABLE_NAME ??
    process.env.DYNAMODB_PROBLEM_TABLE_NAME,
  submissionTableName:
    params.DYNAMODB_SUBMISSION_TABLE_NAME ??
    process.env.DYNAMODB_SUBMISSION_TABLE_NAME,
  workspaceTableName:
    params.DYNAMODB_WORKSPACE_TABLE_NAME ??
    process.env.DYNAMODB_WORKSPACE_TABLE_NAME,
  statisticTableName:
    params.DYNAMODB_STATISTIC_TABLE_NAME ??
    process.env.DYNAMODB_STATISTIC_TABLE_NAME,
  instanceType: params.CLOUD9_INSTANCE_TYPE ?? process.env.CLOUD9_INSTANCE_TYPE,
  imageId: params.CLOUD9_IMAGE_ID ?? process.env.CLOUD9_IMAGE_ID,
  queueUrl: params.SQS_QUEUE_URL ?? process.env.SQS_QUEUE_URL,
  iamUserPath: params.IAM_USER_PATH ?? process.env.IAM_USER_PATH,
  groupName: params.IAM_GROUP_NAME ?? process.env.IAM_GROUP_NAME,
  judgeHostUrl: params.EC2_JUDGE_HOST_DNS_NAME,
}
