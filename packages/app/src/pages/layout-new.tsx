import { onMount, type ParentProps } from "solid-js"
import { useLayout } from "@/context/layout"
import LegacyLayout from "@/pages/layout"

export default function NewLayout(props: ParentProps) {
  const layout = useLayout()

  onMount(() => {
    layout.sidebar.open()
  })

  return <LegacyLayout>{props.children}</LegacyLayout>
}
