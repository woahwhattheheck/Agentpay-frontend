"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

export const SERVICES_SECTION_ERROR_CODES = {
  results: "SERVICES_RESULTS_RENDER_FAILED",
  pagination: "SERVICES_PAGINATION_RENDER_FAILED",
} as const;

export type ServicesSection = keyof typeof SERVICES_SECTION_ERROR_CODES;
export type ServicesSectionErrorCode =
  (typeof SERVICES_SECTION_ERROR_CODES)[ServicesSection];

type Props = {
  section: ServicesSection;
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

const FALLBACK_COPY: Record<ServicesSection, string> = {
  results: "Services could not be displayed.",
  pagination: "Pagination controls are temporarily unavailable.",
};

export class ServicesSectionBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const code: ServicesSectionErrorCode =
      SERVICES_SECTION_ERROR_CODES[this.props.section];

    console.error("Services dashboard section failed", {
      code,
      section: this.props.section,
      error,
      componentStack: info.componentStack,
    });
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const code = SERVICES_SECTION_ERROR_CODES[this.props.section];

    return (
      <div
        role="alert"
        className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm dark:border-rose-900 dark:bg-rose-950"
      >
        <p className="font-medium text-rose-800 dark:text-rose-300">
          {FALLBACK_COPY[this.props.section]}
        </p>
        <p className="mt-1 font-mono text-xs text-rose-600 dark:text-rose-400">
          Reference: {code}
        </p>
        <button
          type="button"
          onClick={this.retry}
          className="mt-3 rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900"
        >
          Retry section
        </button>
      </div>
    );
  }
}
