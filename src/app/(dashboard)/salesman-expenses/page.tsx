import { redirect } from 'next/navigation'

export default function SalesmanExpensesPage() {
  redirect('/my-work?workspace=expenses')
}
