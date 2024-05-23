/**
 * Clones a source iterator into new iterators.
 */
export class IteratorCloner<T> implements Iterable<T> {
    private readonly sourceIterator;
    private readonly generated: T[] = [];
    private done = false;

    /**
     * Constructs a new instance.
     *
     * @param sourceIterator source iterator
     */
    constructor(sourceIterator: Iterator<T>) {
        this.sourceIterator = sourceIterator;
    }

    [Symbol.iterator](): Iterator<T> {
        let index = 0;
        return {
            next: () => {
                let done = false;
                let value;

                // Already generated
                if (index < this.generated.length) {
                    value = this.generated[index++];
                }

                // Already done
                else if (this.done) {
                    done = true;
                }

                // Generate new value
                else {
                    const result = this.sourceIterator.next();
                    if (result.done) {
                        done = this.done = true;
                    } else {
                        value = result.value;
                        this.generated.push(value);
                        index++;
                    }
                }

                // Return result
                return { done: done, value: value } as IteratorResult<T>;
            },
        };
    }
}
