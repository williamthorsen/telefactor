/** Public entry point `@williamthorsen/telefactor/contract`: the contract that the page and the server both import. */
export {
  type ActionDefinition,
  type ActionDefinitions,
  type ActionInput,
  type ActionInputSchema,
  type ActionName,
  type Contract,
  type ContractState,
  defineContract,
  GET_STATE_TOOL_NAME,
  type ParsedActionInput,
} from './contract/define-contract.ts';
export {
  defineJob,
  type JobDeclaration,
  type JobInput,
  type JobResult,
  type ParsedJobInput,
  promptJob,
} from './contract/define-job.ts';
