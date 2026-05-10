export function rollDiceValue(): number {
    const rand = Math.random();
    if (rand < 0.25) return 6;                  // getting a six here is 25% chance
    return Math.floor(rand * 5) + 1;
}
