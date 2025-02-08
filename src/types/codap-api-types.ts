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
export interface GetAttributeListResponse {
  success: boolean
  values?: BasicAttributeInfo[]
}

interface BasicCaseInfo {
  id: number
}
export interface GetCaseFormulaSearchResponse {
  success: boolean
  values?: BasicCaseInfo[]
}
