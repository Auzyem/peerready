import { ReviewDashboard } from '@/components/review/ReviewDashboard'

export default function ReviewPage({ params }: { params: { id: string; sessionId: string } }) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Review</h1>
      <ReviewDashboard sessionId={params.sessionId} />
    </div>
  )
}
