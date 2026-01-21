import ReviewPanel from '@/components/ReviewPanel'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <ReviewPanel checkId={id} />
}
