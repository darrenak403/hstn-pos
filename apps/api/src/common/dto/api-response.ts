export interface AppMessage {
  code: string;
  text: string;
}

export interface ApiError {
  field: string;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: AppMessage | null;
  errors: ApiError[] | null;
}

export function successResponse<T>(data: T, message: AppMessage): ApiResponse<T> {
  return { success: true, data, message, errors: null };
}

export function failureResponse(message: AppMessage, errors: ApiError[] | null = null): ApiResponse<null> {
  return { success: false, data: null, message, errors };
}
