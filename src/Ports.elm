port module Ports exposing
    ( authChanged
    , signIn
    , signInFailed
    , signOut
    , signOutFailed
    )

import User exposing (User)


port signIn : () -> Cmd msg


port signInFailed : (String -> msg) -> Sub msg


port signOut : () -> Cmd msg


port signOutFailed : (String -> msg) -> Sub msg


port authChanged : (Maybe User -> msg) -> Sub msg
