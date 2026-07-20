export class AiReviewOutputError extends Error {
  constructor() {
    super("The AI review response did not match the expected format.");
    this.name = "AiReviewOutputError";
  }
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

export class ReviewRateLimitError extends Error {
  constructor(public readonly limitPerDay: number) {
    super(`You've reached the limit of ${limitPerDay} AI reviews per day. Please try again tomorrow.`);
    this.name = "ReviewRateLimitError";
  }
}
