import { GetParametersByPathCommand } from '@aws-sdk/client-ssm'
import { randomUUID } from 'crypto'
import { customAlphabet } from 'nanoid'
/**
 * @returns {string}
 */
export function generateId() {
  const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8)
  return `${nanoid(4)}-${nanoid(4)}`
}

/**
 * @returns {import('crypto').UUID}
 */
export function generateUUID() {
  return randomUUID()
}

/**
 * @param {Record<string, string>} attributes
 * @returns {Record<string, string>}
 */
export function generateUpdateExpressions(attributes) {
  const entries = Object.entries(attributes)

  const updateExpression =
    'SET ' + entries.map((_, index) => `#k${index} = :v${index}`).join(', ')

  const expressionAttributeNames = entries.reduce((ar, [value, _], key) => {
    ar[`#${key}`] = value
    return ar
  }, {})

  const expressionAttributeValues = entries.reduce((ar, [_, value], key) => {
    ar[`:${key}`] = value
    return ar
  }, {})

  return {
    updateExpression,
    expressionAttributeNames,
    expressionAttributeValues,
  }
}

/**
 * @param {import('@aws-sdk/client-ssm').SSMClient} ssmClient
 * @param {string} path
 * @returns {import('@aws-sdk/client-ssm').Parameter[]}
 */
export async function getAllFromParametersStore(ssmClient, path) {
  let params = []
  let nextToken = null

  do {
    const command = new GetParametersByPathCommand({
      Path: path,
      Recursive: true,
      NextToken: nextToken,
    })
    const { Parameters, NextToken } = await ssmClient.send(command)
    params = params.concat(Parameters)
    nextToken = NextToken
  } while (nextToken)

  return params
}
/**
 * @param {Array<import('@aws-sdk/client-ssm').Parameter>} parameters
 * @returns {{[key: string]: string}}
 */
export function paramStoreConvertParams(parameters) {
  const convertedParameters = {}

  for (const parameter of parameters) {
    const regex = '[^/]+$'
    const key = parameter.Name.substring(parameter.Name.search(regex))
    const value = parameter.Value

    convertedParameters[key] = value
  }
  return convertedParameters
}
