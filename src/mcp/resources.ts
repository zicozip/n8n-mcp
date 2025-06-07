import { ResourceDefinition } from '../types';

export const n8nResources: ResourceDefinition[] = [
  {
    uri: 'workflow://active',
    name: 'Active Workflows',
    description: 'List of all active workflows in n8n',
    mimeType: 'application/json',
  },
  {
    uri: 'workflow://all',
    name: 'All Workflows',
    description: 'List of all workflows in n8n',
    mimeType: 'application/json',
  },
  {
    uri: 'execution://recent',
    name: 'Recent Executions',
    description: 'Recent workflow execution history',
    mimeType: 'application/json',
  },
  {
    uri: 'credentials://types',
    name: 'Credential Types',
    description: 'Available credential types in n8n',
    mimeType: 'application/json',
  },
  {
    uri: 'nodes://available',
    name: 'Available Nodes',
    description: 'List of all available n8n nodes',
    mimeType: 'application/json',
  },
];