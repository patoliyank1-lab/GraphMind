import { createLoaders, Loaders } from './datasources/loaders';

export interface MyContext {
  loaders: Loaders;
  user?: { id: string; email: string };
}

export const createContext = async (): Promise<MyContext> => {
  return {
    loaders: createLoaders(),
  };
};
