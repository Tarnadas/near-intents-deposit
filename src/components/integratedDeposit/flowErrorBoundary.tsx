import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface FlowErrorBoundaryProps {
  children: ReactNode;
}

interface FlowErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

export class FlowErrorBoundary extends Component<
  FlowErrorBoundaryProps,
  FlowErrorBoundaryState
> {
  state: FlowErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): FlowErrorBoundaryState {
    return {
      hasError: true,
      message:
        error instanceof Error ? error.message : "Unexpected error in swap flow",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[near-intents-swap] flow render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 16,
            borderRadius: "var(--oui-rounded-lg, 8px)",
            background: "var(--oui-color-base-5, #2a2a35)",
            color: "var(--oui-color-danger, red)",
            fontSize: 12,
          }}
        >
          {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}
