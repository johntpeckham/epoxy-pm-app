'use client'

import { FormField } from '@/types'

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

interface DynamicFormFieldProps {
  field: FormField
  value: string | string[] | boolean
  onChange: (value: string | string[] | boolean) => void
}

export default function DynamicFormField({ field, value, onChange }: DynamicFormFieldProps) {
  switch (field.type) {
    case 'section_header':
      return (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
            {field.label}
          </p>
        </div>
      )

    case 'short_text':
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={inputCls}
          />
        </div>
      )

    case 'long_text':
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <textarea
            rows={3}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={textareaCls}
          />
        </div>
      )

    case 'date':
      return (
        <div className="w-1/2 sm:w-full">
          <label className={labelCls}>
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls}
          />
        </div>
      )

    case 'number':
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={inputCls}
          />
        </div>
      )

    case 'dropdown':
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <select
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls}
          >
            <option value="">Select...</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      )

    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer py-1">
          <input
            type="checkbox"
            checked={value === true || value === 'true'}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 focus:border-amber-500"
          />
          <span className="text-sm text-gray-700">{field.label}</span>
          {field.required && <span className="text-red-400">*</span>}
        </label>
      )

    case 'checkbox_group': {
      const selected = Array.isArray(value) ? value : []
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <div className="space-y-2">
            {field.options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange([...selected, opt])
                    } else {
                      onChange(selected.filter((s: string) => s !== opt))
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <span className="text-sm text-gray-700">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )
    }

    default:
      return null
  }
}
