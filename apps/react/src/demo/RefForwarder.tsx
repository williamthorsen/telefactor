import { forwardRef as withForwardedRef, type ReactElement, type Ref, type RefObject } from 'react';

/**
 * This component demonstrates how to use `forwardRef` to forward a `ref` to a child component.
 * When `forwardRef` wraps a component, the `ref` value passed to the wrapper is passed as the second argument
 * (called `forwardedRef` here) to the wrapped component.
 */
function RefForwarder({ content }: Props, forwardedRef?: ForwardedRef<HTMLDivElement>): ReactElement {
  return <div ref={forwardedRef}>{content}</div>;
}

type ForwardedRef<T> = Ref<T> | RefObject<T>;

interface Props {
  content: string;
}

export default withForwardedRef(RefForwarder);
