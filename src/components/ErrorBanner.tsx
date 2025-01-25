import React from "react";

interface ValidationError {
  component: string;
  message: string;
}

interface ErrorBannerProps {
  errors: ValidationError[];
}

const ErrorBanner: React.FC<ErrorBannerProps> = ({ errors }) => {
  if (errors.length === 0) return null;

  return (
    <div className="error-banner">
      <div className="error-content">
        {errors.map((error, index) => (
          <div key={index}>
            <strong>{error.component}:</strong> {error.message}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ErrorBanner;
