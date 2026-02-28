import {
  executePipelineGraph,
  type GraphExecutorInput,
  type GraphExecutorState,
  type GraphNode,
} from './graph-executor'

export type PipelineGraphState = GraphExecutorState
export type PipelineGraphNode<TState extends PipelineGraphState> = GraphNode<TState>
export type PipelineGraphInput<TState extends PipelineGraphState> = GraphExecutorInput<TState>

export async function runPipelineGraph<TState extends PipelineGraphState>(
  input: PipelineGraphInput<TState>,
): Promise<TState> {
  return await executePipelineGraph(input)
}
