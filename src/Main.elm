module Main exposing (main)

import Browser
import Html
import Message


main : Program () () ()
main =
    Browser.sandbox
        { init = ()
        , update = \_ model -> model
        , view = \_ -> Html.h1 [] [ Html.text Message.message ]
        }
