/**
 * California Overtime Calculator
 *
 * Rules implemented:
 * - REGULAR: First 8 hours in a single workday
 * - OVERTIME (1.5x): Hours over 8 and up to 12 in a single workday
 * - DOUBLE TIME (2x): Hours over 12 in a single workday
 * - 7TH CONSECUTIVE DAY: First 8 hrs = OT (1.5x), hours over 8 = DT (2x)
 * - WEEKLY OT: Regular hours exceeding 40 in a workweek convert to OT (1.5x)
 * - ANTI-PYRAMIDING: Only daily regular hours count toward the weekly 40-hour threshold
 */

export interface DailyBreakdown {
  /** Total hours worked this day */
  total: number
  regular: number
  overtime: number
  doubleTime: number
}

export interface EmployeeWeeklySummary {
  employeeName: string
  /** Daily totals indexed 0=Mon, 1=Tue, ... 6=Sun */
  daily: DailyBreakdown[]
  regular: number
  overtime: number
  doubleTime: number
  total: number
}

/**
 * Classify a single day's hours into regular / OT / DT
 * following California daily rules.
 *
 * @param hours  Total hours worked that day
 * @param is7thConsecutive  Whether this is the 7th consecutive workday
 */
function classifyDay(hours: number, is7thConsecutive: boolean): DailyBreakdown {
  if (hours <= 0) return { total: 0, regular: 0, overtime: 0, doubleTime: 0 }

  if (is7thConsecutive) {
    // 7th consecutive day: first 8 = OT, over 8 = DT
    const ot = Math.min(hours, 8)
    const dt = Math.max(0, hours - 8)
    return { total: hours, regular: 0, overtime: ot, doubleTime: dt }
  }

  const regular = Math.min(hours, 8)
  const overtime = Math.max(0, Math.min(hours, 12) - 8)
  const doubleTime = Math.max(0, hours - 12)
  return { total: hours, regular, overtime, doubleTime }
}

/**
 * Detect the longest streak of consecutive worked days starting from Monday (index 0).
 * Returns true for each day index if it qualifies as the 7th consecutive day.
 */
function find7thConsecutiveDay(dailyHours: number[]): boolean[] {
  const result = [false, false, false, false, false, false, false]

  // Check if all 7 days were worked (Mon-Sun)
  let consecutiveFromMonday = 0
  for (let i = 0; i < 7; i++) {
    if (dailyHours[i] > 0) {
      consecutiveFromMonday++
    } else {
      break
    }
  }
  if (consecutiveFromMonday === 7) {
    result[6] = true // Sunday is the 7th consecutive day
    return result
  }

  // Also check starting from any day — the "workweek" in CA starts on a fixed day (Monday here).
  // The 7th consecutive day rule applies when an employee works all 7 days of the workweek.
  // Since our workweek is Mon-Sun, we only need to check if all 7 are worked.
  // However, also handle the case where work starts mid-week and wraps:
  // Actually, CA law defines "workweek" as 7 consecutive days. Since we use Mon-Sun,
  // the 7th consecutive day is simply the last day in a streak of all 7 days worked.
  // If not all 7 are worked, no 7th-day rule applies.

  // Check if all 7 days have hours (regardless of order)
  const allWorked = dailyHours.every((h) => h > 0)
  if (allWorked) {
    result[6] = true // Sunday (last day of Mon-Sun workweek) is the 7th day
  }

  return result
}

/**
 * Calculate California overtime for a set of employees given their daily hours.
 *
 * @param employeeHours Map of employee name to array of 7 daily hour totals [Mon..Sun]
 * @returns Array of EmployeeWeeklySummary sorted by employee name
 */
export function calculateCaliforniaOvertime(
  employeeHours: Map<string, number[]>
): EmployeeWeeklySummary[] {
  const results: EmployeeWeeklySummary[] = []

  for (const [name, dailyHours] of employeeHours) {
    const is7th = find7thConsecutiveDay(dailyHours)

    // Step 1: Classify each day
    const daily: DailyBreakdown[] = dailyHours.map((hours, i) =>
      classifyDay(hours, is7th[i])
    )

    // Step 2: Sum daily regular hours for weekly OT calculation (anti-pyramiding)
    let weeklyRegular = daily.reduce((sum, d) => sum + d.regular, 0)
    let weeklyOT = daily.reduce((sum, d) => sum + d.overtime, 0)
    const weeklyDT = daily.reduce((sum, d) => sum + d.doubleTime, 0)

    // Step 3: Apply weekly overtime — if regular hours exceed 40, excess becomes weekly OT
    if (weeklyRegular > 40) {
      const weeklyExcess = weeklyRegular - 40
      weeklyOT += weeklyExcess
      weeklyRegular = 40
    }

    const total = weeklyRegular + weeklyOT + weeklyDT

    results.push({
      employeeName: name,
      daily,
      regular: Math.round(weeklyRegular * 100) / 100,
      overtime: Math.round(weeklyOT * 100) / 100,
      doubleTime: Math.round(weeklyDT * 100) / 100,
      total: Math.round(total * 100) / 100,
    })
  }

  return results.sort((a, b) => a.employeeName.localeCompare(b.employeeName))
}
