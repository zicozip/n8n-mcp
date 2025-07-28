import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';

interface PropertyDefinition {
  name: string;
  displayName: string;
  type: string;
  default?: any;
  required?: boolean;
  description?: string;
  options?: any[];
}

export const PropertyDefinitionFactory = Factory.define<PropertyDefinition>(() => ({
  name: faker.helpers.camelCase(faker.word.noun() + ' ' + faker.word.adjective()),
  displayName: faker.helpers.arrayElement(['URL', 'Method', 'Headers', 'Body', 'Authentication']),
  type: faker.helpers.arrayElement(['string', 'number', 'boolean', 'options', 'json']),
  default: faker.datatype.boolean() ? faker.word.sample() : undefined,
  required: faker.datatype.boolean(),
  description: faker.lorem.sentence(),
  options: faker.datatype.boolean() ? [
    {
      name: faker.word.noun(),
      value: faker.word.noun(),
      description: faker.lorem.sentence()
    }
  ] : undefined
}));