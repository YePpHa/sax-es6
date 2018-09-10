import { IBaseTag } from "./IBaseTag";
export interface ITag extends IBaseTag {
  attributes: {
    [key: string]: string;
  };
}