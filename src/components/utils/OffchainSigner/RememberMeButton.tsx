import { isFunction } from '@polkadot/util'
import Button from 'antd/lib/button'
import React, { useEffect, useRef, useState } from 'react'
import { TxButtonProps } from 'src/components/substrate/SubstrateTxButton'

import axios, { AxiosRequestConfig } from 'axios'
import { offchainSignerRequest } from './OffchainSignerUtils'

import HCaptcha from '@hcaptcha/react-hcaptcha'
import type { Signer } from '@polkadot/api/types'
import { stringToHex } from '@polkadot/util'
import { newLogger } from '@subsocial/utils'
import { useMyAddress } from 'src/components/auth/MyAccountsContext'
import { getCurrentWallet } from 'src/components/auth/utils'
import { useResponsiveSize } from 'src/components/responsive'
import { useSubstrate } from 'src/components/substrate'
import useToggle from 'src/components/substrate/useToggle'
import { getWalletBySource } from 'src/components/wallets/supportedWallets'
import store from 'store'
import { showErrorMessage } from '../Message'
const log = newLogger('RememberMeButton')

const PROXY_ADDRESS = 'ProxyAddress'
export const setProxyAddress = (proxyAddress: string) => store.set(PROXY_ADDRESS, proxyAddress)
export const getProxyAddress = (): string => store.get(PROXY_ADDRESS)

const OFFCHAIN_ADDRESS = 'OffchainAddress'
export const setOffchainAddress = (offchainAddress: string) =>
  store.set(OFFCHAIN_ADDRESS, offchainAddress)
export const getOffchainAddress = (): string => store.get(OFFCHAIN_ADDRESS)

const OFFCHAIN_TOKEN = 'OffchainToken'
export const setOffchainToken = (offchainToken: string) => store.set(OFFCHAIN_TOKEN, offchainToken)
export const getOffchainToken = (): string => store.get(OFFCHAIN_TOKEN)

interface RememberMeButtonProps extends TxButtonProps {
  onFailedAuth: () => void
  onSuccessAuth: () => void
}

function RememberMeButton({
  label,
  disabled,
  loading,
  onClick,
  onSuccessAuth,
  onFailedAuth,
  withSpinner,
  component,
  ...antdProps
}: RememberMeButtonProps) {
  const { api } = useSubstrate()
  const [isConfirming, , setIsConfirming] = useToggle(false)
  const { isMobile } = useResponsiveSize()
  const myAddress = useMyAddress()

  const [token, setToken] = useState<string | undefined>()
  const [captchaReady, setCaptchaReady] = useState(false)
  const hCaptchaRef = useRef(null)

  useEffect(() => {
    if (token) {
      confirmOffchainSigner(token)
    }
  }, [token])

  const onExpire = () => {
    console.warn('hCaptcha Token Expired')
  }

  const onError = (err: any) => {
    console.warn(`hCaptcha Error: ${err}`)
  }

  const onLoad = () => {
    // this reaches out to the hCaptcha JS API and runs the
    // execute function on it. you can use other functions as
    // documented here:
    // https://docs.hcaptcha.com/configuration#jsapi
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    hCaptchaRef.current?.execute()
  }

  const HCAPTCHA_SITE_KEY = 'fc5815a2-6662-420f-8d94-ed72200d8a39'
  // const HCAPTCHA_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001'

  const confirmOffchainSigner = (token: string) => {
    isFunction(onClick) && onClick()

    setIsConfirming(true)
    finaliseOffchainSigner(token)
  }

  const buttonLabel = label || 'Remember me'
  const Component = component || Button

  if (!api || !api.isReady) {
    return (
      <Component {...antdProps} disabled={true}>
        {buttonLabel}
      </Component>
    )
  }

  const onFailedHandler = (err: Error) => {
    if (err) {
      setToken(undefined)
      onFailedAuth()
      setIsConfirming(false)
      const errMsg = `Signing failed: ${err.toString()}`
      log.debug(`❌ ${errMsg}`)
      showErrorMessage(errMsg)
    }
  }

  const requestMessage = async () => {
    if (!myAddress) {
      throw new Error('No account id provided')
    }

    const data = {
      accountAddress: myAddress,
    }

    try {
      const res = await offchainSignerRequest({
        data,
        endpoint: 'auth/generateAuthByAddressProof',
        method: 'POST',
      })

      return res?.data
    } catch (err: any) {
      onFailedHandler(err instanceof Error ? err.message : err)
      return
    }
  }

  const signMessage = async (messageJwt: string): Promise<`0x${string}` | undefined> => {
    if (!myAddress) {
      throw new Error('No account id provided')
    }

    let signer: Signer | undefined

    if (isMobile) {
      const { web3FromAddress } = await import('@polkadot/extension-dapp')
      signer = await (await web3FromAddress(myAddress.toString())).signer
    } else {
      const currentWallet = getCurrentWallet()
      const wallet = getWalletBySource(currentWallet)
      signer = wallet?.signer
    }

    if (!signer) {
      throw new Error('No signer provided')
    }

    if (!signer?.signRaw) {
      throw new Error('signing failed!')
    }

    try {
      const { signature } = await signer.signRaw({
        address: myAddress as string,
        data: stringToHex(messageJwt),
        type: 'bytes',
      })

      return signature
    } catch (err: any) {
      onFailedHandler(err instanceof Error ? err.message : err)
      return
    }
  }

  const sendSignedMessage = async (signedMessageJwt: string, messageJwt: string, token: string) => {
    if (!token) throw new Error('Please confirm hCaptcha!')

    const data = {
      accountAddress: myAddress as string,
      signedMessageJwt,
      messageJwt,
      hcaptchaResponse: token,
    }

    try {
      const res = await offchainSignerRequest({
        data,
        endpoint: 'auth/authByAddress',
        method: 'POST',
      })

      return res?.data
    } catch (err: any) {
      onFailedHandler(err instanceof Error ? err.message : err)
      return
    }
  }

  const fetchProxyAddress = async () => {
    try {
      const res = await offchainSignerRequest({
        endpoint: 'signer/main-proxy-address',
        method: 'GET',
      })

      return res?.data
    } catch (err: any) {
      onFailedHandler(err instanceof Error ? err.message : err)
      return
    }
  }

  const finaliseOffchainSigner = async (token: string) => {
    if (!myAddress) {
      throw new Error('No account id provided')
    }

    try {
      const dataMessage = await requestMessage()
      const { jwt: messageJwt } = dataMessage

      const signedMessageJwt = await signMessage(messageJwt)

      if (!signedMessageJwt) {
        console.warn('Error when retrieving signed message')
        return
      }

      const dataSignature = await sendSignedMessage(signedMessageJwt, messageJwt, token)
      const { accessToken } = dataSignature

      setOffchainAddress(myAddress)
      setOffchainToken(accessToken)

      axios.interceptors.request.use(
        async (config: AxiosRequestConfig) => {
          config.headers = config.headers ?? {}

          config.headers.Authorization = accessToken

          return config
        },
        error => {
          return Promise.reject(error)
        },
      )

      const { address } = await fetchProxyAddress()
      setProxyAddress(address)
      onSuccessAuth()
    } catch (err: any) {
      onFailedHandler(err instanceof Error ? err.message : err)
      return
    }
  }

  const isDisabled = disabled || isConfirming || !captchaReady

  return (
    <>
      <Component
        {...antdProps}
        onClick={() => {
          onLoad()
        }}
        disabled={isDisabled}
        loading={(withSpinner && isConfirming) || loading}
      >
        {buttonLabel}
      </Component>
      <HCaptcha
        size='invisible'
        sitekey={HCAPTCHA_SITE_KEY}
        onVerify={setToken}
        onLoad={() => {
          setCaptchaReady(true)
        }}
        onError={onError}
        onExpire={onExpire}
        ref={hCaptchaRef}
      />
    </>
  )
}

export default React.memo(RememberMeButton)
