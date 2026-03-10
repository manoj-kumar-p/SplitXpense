export interface CRDTChange {
  column: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface CRDTOperation {
  tableName: string;
  rowId: string;
  operationType: 'INSERT' | 'UPDATE' | 'DELETE';
  changes: CRDTChange[];
  hlcTimestamp: string;
  originPeer: string;
}
