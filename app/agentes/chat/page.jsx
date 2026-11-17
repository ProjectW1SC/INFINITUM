'use client';
import SecuredWorkspace from '../../../components/secured-workspace';
import OpenBotStudio from '../../../components/openbot-studio';
export default function Page(){return <SecuredWorkspace active="OpenBot" fullscreen>{({db,session})=><OpenBotStudio db={db} session={session}/>}</SecuredWorkspace>}
