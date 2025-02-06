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
