import { ComputableMap } from "./ComputableMap";

/**
 * An anstract typed event target base which can be used as a base class to support typed events.
 *
 * @param <O> target object type
 * @param <M> mapping of event names to event types
 */
export abstract class TypedEventTarget<O, M> {
    private readonly listeners = new ComputableMap<string, Set<(ev: TypedEvent<O, string>) => void>>();

    /**
     * Adds an event listener.
     *
     * @param type event type
     * @param listener event listener
     */
    addEventListener<T extends Extract<keyof M, string>>(type: T, listener: (ev: M[T]) => void) {
        this.getListenersForType(type).add(listener as (ev: TypedEvent<O, string>) => void);
    }

    /**
     * Removes an event listener
     *
     * @param type event type
     * @param listener event listener
     */
    removeEventListener<T extends Extract<keyof M, string>>(type: T, listener: (ev: M[T]) => void) {
        this.getListenersForType(type).delete(listener as (ev: TypedEvent<O, string>) => void);
    }

    /**
     * Dispatches event to the specified listeners.
     *
     * @param ev event
     */
    protected dispatchEvent<T extends Extract<keyof M, string>>(ev: TypedEvent<O, T>) {
        this.getListenersForType(ev.type).forEach((listener) => {
            listener(ev);
        });
    }

    private getListenersForType(type: string) {
        return this.listeners.computeIfAbsent(type, () => new Set());
    }
}

/**
 * Interface for events.
 */
export interface TypedEvent<O, T extends string> {
    target: O;
    type: T;
}
