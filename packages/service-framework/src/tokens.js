export class ServiceToken {
    description;
    id;
    constructor(description) {
        this.description = description;
        this.id = Symbol(description);
    }
    toString() {
        return this.description;
    }
}
export function createServiceToken(description) {
    return new ServiceToken(description);
}
//# sourceMappingURL=tokens.js.map