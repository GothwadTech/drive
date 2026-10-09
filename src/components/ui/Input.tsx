import React, { forwardRef, useState } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = "", onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            className={`block text-xs font-medium tracking-wide select-none transition-colors duration-200 ${
              focused
                ? "text-md-primary"
                : "text-md-on-surface-variant"
            }`}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-md-on-surface-variant flex items-center justify-center pointer-events-none select-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`w-full bg-white dark:bg-[#1e1e1e] border rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none transition-all duration-200 ${
              focused
                ? "border-[#0494f4] ring-2 ring-[#0494f4]/20"
                : "border-gray-200 dark:border-[#383838]"
            } ${icon ? "pl-11" : ""} ${
              error ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : ""
            } ${className}`}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-md-error font-medium mt-1 animate-spring-slide-up select-none">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
