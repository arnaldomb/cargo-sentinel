export interface IntelbrasPayload {
  PlateNumber: string;
  DateTime: string;
  CameraId: string;
  Direction?: string;
  ImageBase64: string;
  Confidence?: number;
  VehicleType?: string;
}

export interface LprJobData {
  PlateNumber: string;
  ImageBase64: string;
  CameraId: string;
  Direction?: string;
  DateTime: string;
  idempotencyKey: string;
}
