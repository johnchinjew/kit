module NoticeState exposing
    ( Notice
    , NoticeState
    , empty
    , expire
    , set
    )

import Process
import Task


type alias NoticeState =
    { current : Maybe Notice
    , nextId : Int
    }


type alias Notice =
    { id : Int
    , message : String
    }


empty : NoticeState
empty =
    { current = Nothing, nextId = 0 }


set : (Int -> msg) -> String -> NoticeState -> ( NoticeState, Cmd msg )
set onExpiration message state =
    let
        notice =
            { id = state.nextId
            , message = message
            }
    in
    ( { state | current = Just notice, nextId = state.nextId + 1 }
    , Task.perform (\_ -> onExpiration notice.id) (Process.sleep (toFloat 6000))
    )


expire : Int -> NoticeState -> NoticeState
expire noticeId state =
    case state.current of
        Just notice ->
            if notice.id == noticeId then
                { state | current = Nothing }

            else
                state

        Nothing ->
            state
