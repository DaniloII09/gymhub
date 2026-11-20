export class ReviewTargetNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewTargetNotFoundError';
  }
}

export class DuplicateReviewError extends Error {
  constructor() {
    super('Ya calificaste esta clase o sesión.');
    this.name = 'DuplicateReviewError';
  }
}

export class ReviewNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewNotAllowedError';
  }
}
