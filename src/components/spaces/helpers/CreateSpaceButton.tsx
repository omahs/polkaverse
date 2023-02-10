import { PlusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { ButtonProps } from 'antd/lib/button'
import { ButtonLink, IconLink } from 'src/components/utils/CustomLinks'
import { BareProps } from 'src/components/utils/types'

const newSpacePath = '/spaces/new'
const title = 'Create space'

export const CreateSpaceButton = ({
  children,
  type = 'primary',
  ghost = true,
  asProfile,
  ...otherProps
}: ButtonProps & { asProfile?: boolean }) => {
  const props = { type, ghost, ...otherProps }

  return (
    <ButtonLink href={`${newSpacePath}${asProfile ? '?as-profile=true' : ''}`} {...props}>
      {children || (
        <span>
          <PlusOutlined /> {title}
        </span>
      )}
    </ButtonLink>
  )
}

const CreateIcon = <PlusCircleOutlined size={48} />

export const CreateSpaceIcon = (props: BareProps) => (
  <IconLink {...props} href={newSpacePath} as={newSpacePath} title={title} icon={CreateIcon} />
)
