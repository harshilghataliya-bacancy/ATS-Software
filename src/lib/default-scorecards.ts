/**
 * Default scorecards that match the interview name dropdown values.
 * These are seeded per-org on first use or via the "Seed Defaults" button.
 */

interface DefaultCriteria {
  name: string
  description: string
  weight: number
  rating_type: 'rating' | 'yes_no' | 'text'
  display_order: number
  category: string
}

interface DefaultScorecard {
  title: string
  description: string
  criteria: DefaultCriteria[]
}

export const DEFAULT_SCORECARDS: DefaultScorecard[] = [
  {
    title: 'Technical Round 1',
    description: 'Initial technical screening to assess core technical skills and problem-solving ability.',
    criteria: [
      { name: 'Technical Knowledge', description: 'Core understanding of relevant technologies and concepts', weight: 9, rating_type: 'rating', display_order: 1, category: 'Technical Skills' },
      { name: 'Problem Solving', description: 'Ability to break down and solve technical problems', weight: 8, rating_type: 'rating', display_order: 2, category: 'Technical Skills' },
      { name: 'Code Quality', description: 'Writing clean, readable, and maintainable code', weight: 7, rating_type: 'rating', display_order: 3, category: 'Technical Skills' },
      { name: 'Communication', description: 'Ability to explain technical concepts clearly', weight: 6, rating_type: 'rating', display_order: 4, category: 'Soft Skills' },
      { name: 'Overall Impression', description: 'General assessment and additional notes', weight: 5, rating_type: 'text', display_order: 5, category: 'General' },
    ],
  },
  {
    title: 'Technical Round 2',
    description: 'Advanced technical assessment focusing on system design and architecture skills.',
    criteria: [
      { name: 'System Design', description: 'Ability to design scalable and robust systems', weight: 9, rating_type: 'rating', display_order: 1, category: 'Architecture' },
      { name: 'Architecture Knowledge', description: 'Understanding of design patterns and architecture principles', weight: 8, rating_type: 'rating', display_order: 2, category: 'Architecture' },
      { name: 'Technical Depth', description: 'Deep expertise in specific technical areas', weight: 8, rating_type: 'rating', display_order: 3, category: 'Technical Skills' },
      { name: 'Problem Solving Approach', description: 'Structured approach to complex problems', weight: 7, rating_type: 'rating', display_order: 4, category: 'Technical Skills' },
      { name: 'Trade-off Analysis', description: 'Ability to evaluate and articulate trade-offs', weight: 6, rating_type: 'rating', display_order: 5, category: 'Analytical Skills' },
      { name: 'Overall Impression', description: 'General assessment and additional notes', weight: 5, rating_type: 'text', display_order: 6, category: 'General' },
    ],
  },
  {
    title: 'Technical Round 3',
    description: 'Final technical evaluation with focus on real-world problem solving and collaboration.',
    criteria: [
      { name: 'Real-World Problem Solving', description: 'Solving practical problems similar to actual work', weight: 9, rating_type: 'rating', display_order: 1, category: 'Technical Skills' },
      { name: 'Collaboration', description: 'Working together effectively during pair programming or discussions', weight: 7, rating_type: 'rating', display_order: 2, category: 'Soft Skills' },
      { name: 'Code Review Skills', description: 'Ability to review code and provide constructive feedback', weight: 7, rating_type: 'rating', display_order: 3, category: 'Technical Skills' },
      { name: 'Debugging Skills', description: 'Systematic approach to identifying and fixing issues', weight: 8, rating_type: 'rating', display_order: 4, category: 'Technical Skills' },
      { name: 'Overall Impression', description: 'General assessment and additional notes', weight: 5, rating_type: 'text', display_order: 5, category: 'General' },
    ],
  },
  {
    title: 'HR Round',
    description: 'HR evaluation covering compensation expectations, notice period, and cultural alignment.',
    criteria: [
      { name: 'Communication Skills', description: 'Clarity, professionalism, and articulation', weight: 8, rating_type: 'rating', display_order: 1, category: 'Communication Skills' },
      { name: 'Cultural Fit', description: 'Alignment with company values and work culture', weight: 8, rating_type: 'rating', display_order: 2, category: 'Cultural Fit' },
      { name: 'Motivation & Career Goals', description: 'Clarity of career direction and motivation for the role', weight: 7, rating_type: 'rating', display_order: 3, category: 'Soft Skills' },
      { name: 'Salary Expectations Aligned', description: 'Compensation expectations within budget range', weight: 6, rating_type: 'yes_no', display_order: 4, category: 'Logistics' },
      { name: 'Notice Period Acceptable', description: 'Can join within the required timeframe', weight: 6, rating_type: 'yes_no', display_order: 5, category: 'Logistics' },
      { name: 'Additional Notes', description: 'Any other observations or concerns', weight: 5, rating_type: 'text', display_order: 6, category: 'General' },
    ],
  },
  {
    title: 'Managerial Round',
    description: 'Manager-level evaluation focusing on leadership, team fit, and strategic thinking.',
    criteria: [
      { name: 'Leadership Potential', description: 'Ability to lead and influence others', weight: 9, rating_type: 'rating', display_order: 1, category: 'Leadership' },
      { name: 'Strategic Thinking', description: 'Ability to think beyond immediate tasks and consider broader impact', weight: 8, rating_type: 'rating', display_order: 2, category: 'Leadership' },
      { name: 'Team Fit', description: 'How well the candidate would integrate with the existing team', weight: 8, rating_type: 'rating', display_order: 3, category: 'Cultural Fit' },
      { name: 'Decision Making', description: 'Quality of decision-making under ambiguity', weight: 7, rating_type: 'rating', display_order: 4, category: 'Analytical Skills' },
      { name: 'Domain Knowledge', description: 'Relevant industry or domain expertise', weight: 7, rating_type: 'rating', display_order: 5, category: 'Technical Skills' },
      { name: 'Overall Assessment', description: 'General impression and hire recommendation', weight: 5, rating_type: 'text', display_order: 6, category: 'General' },
    ],
  },
  {
    title: 'Culture Fit Round',
    description: 'Evaluation of alignment with company values, team dynamics, and work style.',
    criteria: [
      { name: 'Values Alignment', description: 'Alignment with company mission and core values', weight: 9, rating_type: 'rating', display_order: 1, category: 'Cultural Fit' },
      { name: 'Team Collaboration', description: 'Ability to work effectively in a team environment', weight: 8, rating_type: 'rating', display_order: 2, category: 'Cultural Fit' },
      { name: 'Adaptability', description: 'Willingness to adapt to new situations and challenges', weight: 7, rating_type: 'rating', display_order: 3, category: 'Soft Skills' },
      { name: 'Growth Mindset', description: 'Eagerness to learn, grow, and accept feedback', weight: 7, rating_type: 'rating', display_order: 4, category: 'Soft Skills' },
      { name: 'Work-Life Balance Expectations', description: 'Reasonable expectations about work hours and flexibility', weight: 6, rating_type: 'yes_no', display_order: 5, category: 'Logistics' },
      { name: 'Overall Culture Fit', description: 'Summary of cultural alignment assessment', weight: 5, rating_type: 'text', display_order: 6, category: 'General' },
    ],
  },
  {
    title: 'Assignment Review',
    description: 'Evaluation of take-home assignment or coding challenge submission.',
    criteria: [
      { name: 'Code Quality', description: 'Clean, well-structured, and maintainable code', weight: 9, rating_type: 'rating', display_order: 1, category: 'Code Quality' },
      { name: 'Requirements Coverage', description: 'All specified requirements are addressed', weight: 9, rating_type: 'rating', display_order: 2, category: 'Code Quality' },
      { name: 'Problem Approach', description: 'How the candidate approached and structured the solution', weight: 8, rating_type: 'rating', display_order: 3, category: 'Technical Skills' },
      { name: 'Testing', description: 'Presence and quality of tests', weight: 7, rating_type: 'rating', display_order: 4, category: 'Code Quality' },
      { name: 'Documentation', description: 'README, comments, and overall documentation quality', weight: 6, rating_type: 'rating', display_order: 5, category: 'Code Quality' },
      { name: 'Bonus / Extra Features', description: 'Additional features or improvements beyond requirements', weight: 4, rating_type: 'text', display_order: 6, category: 'General' },
    ],
  },
  {
    title: 'Final Round',
    description: 'Final evaluation round to make the hire/no-hire decision.',
    criteria: [
      { name: 'Overall Technical Competency', description: 'Combined assessment of all technical rounds', weight: 9, rating_type: 'rating', display_order: 1, category: 'Technical Skills' },
      { name: 'Cultural & Team Fit', description: 'Overall assessment of cultural alignment and team integration', weight: 8, rating_type: 'rating', display_order: 2, category: 'Cultural Fit' },
      { name: 'Communication & Professionalism', description: 'Overall professional demeanor and communication skills', weight: 7, rating_type: 'rating', display_order: 3, category: 'Communication Skills' },
      { name: 'Growth Potential', description: 'Long-term potential for growth within the organization', weight: 7, rating_type: 'rating', display_order: 4, category: 'Soft Skills' },
      { name: 'Hire Recommendation', description: 'Would you recommend hiring this candidate?', weight: 10, rating_type: 'yes_no', display_order: 5, category: 'General' },
      { name: 'Final Notes', description: 'Any final comments, concerns, or strong endorsements', weight: 5, rating_type: 'text', display_order: 6, category: 'General' },
    ],
  },
]
