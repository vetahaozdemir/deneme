import React from 'react';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  containerClassName?: string;
}

const FormInput: React.FC<FormInputProps> = ({ label, error, containerClassName = '', className = '', ...props }) => {
  return (
    <div className={`mb-2 ${containerClassName}`}>
      {label && <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>}
      <input {...props} className={`form-input ${className}`} />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
};

export default FormInput;
