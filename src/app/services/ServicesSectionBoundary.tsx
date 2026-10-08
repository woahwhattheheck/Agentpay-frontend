"use client";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

export const SERVICES_SECTION_ERROR_CODES = {
  serviceList: "SERVICES_LIST_RENDER_FAILED",
  pagination: "SERVICES_PAGINATION_RENDER_FAILED",
} as const;

export type ServicesSectionErrorCode =
  (typeof SERVICES_SECTION_ERROR_CODES)[keyof typeof SERVICES_SECTION_ERROR_CODES];

export type ServicesSectionFailure = {
  code: ServicesSectionErrorCode;
  section: string;
  error: Error;
  componentStack: string | null;
};

type ServicesSectionBoundaryProps = {
  sectionName: string;
  errorCode: ServicesSectionErrorCode;
  children: ReactNode;
};

type ServicesSectionBoundaryState = {
  hasError: boolean;
};

/**
 * Keeps one services-dashboard subtree from taking down its siblings.
 * Render failures are logged for observability while the UI intentionally
 * avoids exposing exception details to users.
 */
export class ServicesSectionBoundary extends Component<
  ServicesSectionBoundaryProps,
  ServicesSectionBoundaryState
> {
  state: ServicesSectionBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ServicesSectionBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const failure: ServicesSectionFailure = {
      code: this.props.errorCode,
      section: this.props.sectionName,
      error,
      componentStack: info.componentStack,
    };

    console.error("Services dashboard section failed", failure);
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section
        role="alert"
        aria-live="assertive"
        className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm dark:border-rose-900 dark:bg-rose-950"
      >
        <p className="font-medium text-rose-800 dark:text-rose-300">
          {this.props.sectionName} unavailable.
        </p>
        <p className="mt-1 text-rose-700 dark:text-rose-400">
          This section hit an unexpected error. The rest of the dashboard is
          still available.
        </p>
        <p
          data-testid="services-section-error-code"
          className="mt-2 font-mono text-xs text-rose-700 dark:text-rose-400"
        >
          Reference: {this.props.errorCode}
        </p>
        <button
          type="button"
          onClick={this.retry}
          className="mt-3 rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900"
        >
          Retry section
        </button>
      </section>
    );
  }
}
