type APIRequestAction = "create" | "delete" | "get" | "notify" | "update";
type CaseValue = string | boolean | number;
export type CaseValues = Record<string, CaseValue>;
export interface CreateCaseValue {
  values: CaseValues
}
export interface UpdateCaseValue {
  id: number | string
  values: CaseValues
}
export interface NotifyDataContextValues {
  request: string
  caseIDs: number[]
}
export interface CreateAttributeValue {
  description?: string
  formula?: string
  hidden?: boolean
  name: string
  precision?: number
  title?: string
  unit?: string
}
type APIRequestValues = CreateAttributeValue[] | CreateCaseValue[] | UpdateCaseValue[];
export interface APIRequest {
  action: APIRequestAction
  resource: string
  values?: APIRequestValues
}
export interface NotifyDataContextRequest {
  action: APIRequestAction
  resource: string
  values: NotifyDataContextValues
}

interface CodapComponent {
  id: number
  title?: string
  type: string
}
export interface CreateComponentResponse {
  success: boolean
  values: CodapComponent
}
export interface GetComponentListResponse {
  success: boolean
  values?: CodapComponent[]
}

interface BasicDataContextInfo {
  id: number
  name: string
  title: string
}
export interface CreateDataContextResponse {
  success: boolean
  values?: BasicDataContextInfo
}
export interface GetDataContextListResponse {
  success: boolean
  values?: BasicDataContextInfo[]
}

interface BasicCollectionInfo {
  id: number
  name: string
  title: string
}
export interface GetCollectionListResponse {
  success: boolean
  values?: BasicCollectionInfo[]
}

interface BasicAttributeInfo {
  id: number
  name: string
  title: string
}
export interface CreateAttributeResponse {
  success: boolean
  values?: { attrs: BasicAttributeInfo[] }
}
export interface GetAttributeListResponse {
  success: boolean
  values?: BasicAttributeInfo[]
}

export interface BasicCaseInfo {
  id: number
}
export interface CreateCaseResponse {
  success: boolean
  values?: BasicCaseInfo[]
}
export interface CaseInfo {
  children: number[]
  id: number
  parent?: number
  values: CaseValues
}
export interface GetCaseByIDResponse {
  success: boolean
  values?: { case: CaseInfo }
}
export interface GetCaseFormulaSearchResponse {
  success: boolean
  values?: CaseInfo[]
}

export type ItemValues = Record<string, string>;
export interface ItemInfo {
  id: string
  values: ItemValues
}
export interface GetItemByCaseIDResponse {
  success: boolean
  values?: ItemInfo
}
export interface GetItemSearchResponse {
  success: boolean
  values?: ItemInfo[]
}

interface SelectionListValue {
  caseID: number
  collectionID: number
  collectionName: string
}
export interface GetSelectionListResponse {
  success: boolean
  values?: SelectionListValue[]
}
