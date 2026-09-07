export class AppError extends Error {
	public readonly statusCode: number;
	public readonly errors: unknown[];
	public readonly isOperational: boolean;

	constructor(statusCode: number, message: string, errors: unknown[] = []) {
		super(message);
		this.statusCode = statusCode;
		this.errors = errors;
		this.isOperational = true;
		Object.setPrototypeOf(this, AppError.prototype);
	}
}
