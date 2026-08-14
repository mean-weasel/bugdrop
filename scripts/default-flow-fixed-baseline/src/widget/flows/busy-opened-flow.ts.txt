import { createRuntimeId } from '../variants/form';
import type { FlowOutcome, OpenedFlow } from './public-types';

export function createBusyOpenedFlow(flowId: string): OpenedFlow {
  return Object.freeze({
    instanceId: createRuntimeId(flowId),
    result: Promise.resolve<FlowOutcome>({ status: 'busy' }),
    close() {},
  });
}
