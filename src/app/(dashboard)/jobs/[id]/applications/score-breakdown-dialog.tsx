'use client'

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

interface MatchScore {
  id: string
  overall_score: number
  skill_score: number
  experience_score: number
  semantic_score: number
  ai_summary: string | null
  recommendation: string | null
  strengths: string[]
  concerns: string[]
  breakdown: {
    skills_found?: string[]
    skills_missing?: string[]
    experience_details?: string
  }
  model_used: string
  scored_at: string
}

interface ScoreBreakdownDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidateName: string
  score: MatchScore | null
}

const RECOMMENDATION_CONFIG: Record<string, { label: string; color: string }> = {
  strong_match: { label: 'Strong Match', color: 'bg-green-100 text-green-800' },
  good_match: { label: 'Good Match', color: 'bg-green-50 text-green-700' },
  moderate_match: { label: 'Moderate Match', color: 'bg-yellow-50 text-yellow-700' },
  weak_match: { label: 'Weak Match', color: 'bg-orange-50 text-orange-700' },
  poor_match: { label: 'Poor Match', color: 'bg-red-50 text-red-700' },
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-700'
  if (score >= 60) return 'text-yellow-700'
  if (score >= 40) return 'text-orange-600'
  return 'text-red-600'
}

function getProgressColor(score: number): string {
  if (score >= 80) return '[&>div]:bg-green-500'
  if (score >= 60) return '[&>div]:bg-yellow-500'
  if (score >= 40) return '[&>div]:bg-orange-500'
  return '[&>div]:bg-red-500'
}

export function ScoreBreakdownDialog({
  open,
  onOpenChange,
  candidateName,
  score,
}: ScoreBreakdownDialogProps) {
  if (!score) return null

  const recConfig = RECOMMENDATION_CONFIG[score.recommendation ?? ''] ?? {
    label: score.recommendation ?? 'Unknown',
    color: 'bg-gray-100 text-gray-700',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Match Score - {candidateName}</DialogTitle>
          <DialogDescription>
            Detailed breakdown of the AI-generated match analysis
          </DialogDescription>
        </DialogHeader>

        {/* Overall Score */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-sm text-gray-500">Overall Match</p>
            <p className={`text-3xl font-bold ${getScoreColor(score.overall_score)}`}>
              {score.overall_score}%
            </p>
          </div>
          <Badge className={recConfig.color}>{recConfig.label}</Badge>
        </div>

        {/* Score Bars */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Skills Match</span>
              <span className={`font-medium ${getScoreColor(score.skill_score)}`}>
                {score.skill_score}%
              </span>
            </div>
            <Progress value={score.skill_score} className={`h-2 ${getProgressColor(score.skill_score)}`} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Experience Match</span>
              <span className={`font-medium ${getScoreColor(score.experience_score)}`}>
                {score.experience_score}%
              </span>
            </div>
            <Progress value={score.experience_score} className={`h-2 ${getProgressColor(score.experience_score)}`} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Semantic Similarity</span>
              <span className={`font-medium ${getScoreColor(score.semantic_score)}`}>
                {score.semantic_score}%
              </span>
            </div>
            <Progress value={score.semantic_score} className={`h-2 ${getProgressColor(score.semantic_score)}`} />
          </div>
        </div>

        {/* AI Summary */}
        {score.ai_summary && (
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-gray-900">AI Summary</h4>
            <p className="text-sm text-gray-600 leading-relaxed">{score.ai_summary}</p>
          </div>
        )}

        {/* Strengths */}
        {score.strengths.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-sm font-medium text-green-800">Strengths</h4>
            <ul className="space-y-1">
              {score.strengths.map((s, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                  <span className="text-green-500 mt-0.5">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Concerns */}
        {score.concerns.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-sm font-medium text-red-800">Concerns</h4>
            <ul className="space-y-1">
              {score.concerns.map((c, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                  <span className="text-red-500 mt-0.5">-</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Skills Breakdown */}
        {(score.breakdown?.skills_found?.length || score.breakdown?.skills_missing?.length) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-900">Skills Analysis</h4>
            {score.breakdown.skills_found && score.breakdown.skills_found.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {score.breakdown.skills_found.map((skill, i) => (
                  <Badge key={i} variant="secondary" className="bg-green-50 text-green-700 text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            )}
            {score.breakdown.skills_missing && score.breakdown.skills_missing.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {score.breakdown.skills_missing.map((skill, i) => (
                  <Badge key={i} variant="secondary" className="bg-red-50 text-red-600 text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs text-gray-400 pt-2 border-t">
          Scored {new Date(score.scored_at).toLocaleString()} using {score.model_used}
        </div>
      </DialogContent>
    </Dialog>
  )
}
