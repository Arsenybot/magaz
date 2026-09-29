/**
 * Core Application Errors
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(`${entity} ${id ? `with identifier "${id}" ` : ''}not found.`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 422, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class InsufficientStockError extends AppError {
  constructor(productName: string, requested: number, available: number) {
    super(
      `Недостаточно товара "${productName}" на складе. Запрошено: ${requested}, доступно: ${available}.`,
      409,
      'INSUFFICIENT_STOCK'
    );
    this.name = 'InsufficientStockError';
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(fromState: string, toState: string) {
    super(
      `Недопустимый переход статуса заказа из "${fromState}" в "${toState}".`,
      400,
      'INVALID_STATE_TRANSITION'
    );
    this.name = 'InvalidStateTransitionError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Доступ запрещён.') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Требуется авторизация.') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}
