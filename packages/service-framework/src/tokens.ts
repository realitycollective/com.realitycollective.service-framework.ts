export class ServiceToken<TService> {
  public readonly id: symbol;

  public constructor(public readonly description: string) {
    this.id = Symbol(description);
  }

  public toString(): string {
    return this.description;
  }
}

export function createServiceToken<TService>(description: string): ServiceToken<TService> {
  return new ServiceToken<TService>(description);
}
