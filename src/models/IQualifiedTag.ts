import { IBaseTag } from "./IBaseTag";
import { IQualifiedAttribute } from "./IQualifiedAttribute";
import { IQualifiedName } from "./IQualifiedName";

// Interface used when the xmlns option is set
export interface IQualifiedTag extends IQualifiedName, IBaseTag {
  ns: {
    [key: string]: string;
  };
  attributes: {
    [key: string]: IQualifiedAttribute;
  };
}