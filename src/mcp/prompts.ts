import { PromptDefinition } from '../types';

export const n8nPrompts: PromptDefinition[] = [
  {
    name: 'create_workflow_prompt',
    description: 'Generate a prompt to create a new n8n workflow',
    arguments: [
      {
        name: 'description',
        description: 'Description of what the workflow should do',
        required: true,
      },
      {
        name: 'inputType',
        description: 'Type of input the workflow expects',
        required: false,
      },
      {
        name: 'outputType',
        description: 'Type of output the workflow should produce',
        required: false,
      },
    ],
  },
  {
    name: 'debug_workflow_prompt',
    description: 'Generate a prompt to debug an n8n workflow',
    arguments: [
      {
        name: 'workflowId',
        description: 'ID of the workflow to debug',
        required: true,
      },
      {
        name: 'errorMessage',
        description: 'Error message or issue description',
        required: false,
      },
    ],
  },
  {
    name: 'optimize_workflow_prompt',
    description: 'Generate a prompt to optimize an n8n workflow',
    arguments: [
      {
        name: 'workflowId',
        description: 'ID of the workflow to optimize',
        required: true,
      },
      {
        name: 'optimizationGoal',
        description: 'What to optimize for (speed, reliability, cost)',
        required: false,
      },
    ],
  },
  {
    name: 'explain_workflow_prompt',
    description: 'Generate a prompt to explain how a workflow works',
    arguments: [
      {
        name: 'workflowId',
        description: 'ID of the workflow to explain',
        required: true,
      },
      {
        name: 'audienceLevel',
        description: 'Technical level of the audience (beginner, intermediate, expert)',
        required: false,
      },
    ],
  },
];