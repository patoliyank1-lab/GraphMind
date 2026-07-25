import { createLoaders, Loaders } from './datasources/loaders';

export interface MyContext {
  loaders: Loaders;
}

export const createContext = async (): Promise<MyContext> => {
  return {
    loaders: createLoaders(),
  };
};
