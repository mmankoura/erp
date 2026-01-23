"use client"

import { useState, useEffect, useCallback } from "react"
import { api, ApiError } from "@/lib/api"

interface UseApiState<T> {
  data: T | null
  isLoading: boolean
  error: ApiError | Error | null
}

interface UseApiResult<T> extends UseApiState<T> {
  refetch: () => Promise<void>
  mutate: (newData: T) => void
}

export function useApi<T>(
  endpoint: string,
  options?: {
    enabled?: boolean
    initialData?: T
  }
): UseApiResult<T> {
  const { enabled = true, initialData = null } = options || {}

  const [state, setState] = useState<UseApiState<T>>({
    data: initialData,
    isLoading: enabled,
    error: null,
  })

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const data = await api.get<T>(endpoint)
      setState({ data, isLoading: false, error: null })
    } catch (error) {
      setState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }, [endpoint])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [enabled, fetchData])

  const mutate = useCallback((newData: T) => {
    setState((prev) => ({ ...prev, data: newData }))
  }, [])

  return {
    ...state,
    refetch: fetchData,
    mutate,
  }
}

// Mutation hook for POST, PUT, PATCH, DELETE
interface UseMutationOptions<TData, TVariables> {
  onSuccess?: (data: TData, variables: TVariables) => void
  onError?: (error: Error, variables: TVariables) => void
}

interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData | undefined>
  isLoading: boolean
  error: Error | null
  data: TData | null
  reset: () => void
}

export function useMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationOptions<TData, TVariables>
): UseMutationResult<TData, TVariables> {
  const [state, setState] = useState<{
    isLoading: boolean
    error: Error | null
    data: TData | null
  }>({
    isLoading: false,
    error: null,
    data: null,
  })

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | undefined> => {
      setState({ isLoading: true, error: null, data: null })
      try {
        const data = await mutationFn(variables)
        setState({ isLoading: false, error: null, data })
        options?.onSuccess?.(data, variables)
        return data
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        setState({ isLoading: false, error: err, data: null })
        options?.onError?.(err, variables)
        return undefined
      }
    },
    [mutationFn, options]
  )

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, data: null })
  }, [])

  return {
    ...state,
    mutate,
    reset,
  }
}
