export declare class ServiceToken<TService> {
    readonly description: string;
    readonly id: symbol;
    constructor(description: string);
    toString(): string;
}
export declare function createServiceToken<TService>(description: string): ServiceToken<TService>;
//# sourceMappingURL=tokens.d.ts.map