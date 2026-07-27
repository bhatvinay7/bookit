import React from "react";

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export default function FormField({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = "text", 
  required = false, 
  autoFocus = false 
}: FormFieldProps) {
  return (
    <div>
      <label className="admin-label">
        {label}{required && " *"}
      </label>
      <input 
        className="admin-input" 
        type={type} 
        placeholder={placeholder}
        value={value} 
        required={required} 
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} 
      />
    </div>
  );
}
