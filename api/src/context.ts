export interface MyContext {
  // auth and DB access will be wired in here later
}

export const createContext = async (): Promise<MyContext> => {
  return {};
};
