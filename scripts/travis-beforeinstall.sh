#!/usr/bin/env bash

isFunction() {
  declare -fF -- "${@:?'No arguments provided.'}" > /dev/null
  return "${?}"
}

beforeInstall::main() {
    pecl channel-update pecl.php.net
    pecl install "xdebug-${XDEBUG_VERSION}"
    phpenv config-add "${TRAVIS_INI}"
    nvm install "${NODE_VERSION}"
    nvm use "${NODE_VERSION}"
    npm install -g "npm@${NPM_VERSION}" --depth 0
    unset TRAVIS_INI
}

beforeInstall::test() {
    declare vAbbr=7.1 vFull dirConfd dirCellar
    declare atAbbr="php@${vAbbr}"

    # Fix ruby error https://github.com/Homebrew/brew/issues/3299
    brew install "${atAbbr}" nvm

    # full version
    vFull="$(php --version | egrep -o '([[:digit:]]+\.?){2,3}' | head -1)"
    vAbbr="${vFull%.*}"
    printf -v dirConfd '/usr/local/etc/php/%s/conf.d' "${vAbbr}"
    printf -v dirCellar '/usr/local/Cellar/%s/%s/pecl' "${atAbbr}" "${vFull}"

    brew link --force --overwrite "${atAbbr}"
    mkdir -p "${dirConfd}"
    cp -f "${TRAVIS_INI}" "${dirConfd}"
    TRAVIS_INI="${dirConfd}/travis-php.ini"
    # see per https://javorszky.co.uk/2018/05/03/getting-xdebug-working-on-php-7-2-and-homebrew/
    # avoid problems with brew's symlink and pecl's recursive mkdir
    rm "${dirCellar}"
    pecl install "xdebug-${XDEBUG_VERSION}"
    # make xdebug.so available at pecl's expected location
    ln -s "${dirCellar}" '/usr/local/lib/php/pecl'
    php --ini

    [ -r "${HOME}/.nvm/nvm.sh" ] && . "${HOME}/.nvm/nvm.sh"
    beforeInstall::main
}

beforeInstall() {
    # dir with no trailing directory separator
    export DIR_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    export DIR_REPO="${DIR_SCRIPTS}/.."
    export TRAVIS_INI="${DIR_REPO}/travis-php.ini"
    declare fn="beforeInstall::${1:-"main"}"
    isFunction "${fn}" && printf 'Running %s.\n' "${fn}" && $fn 2>&1
    return "${?}"
}

beforeInstall "${@}"
exit "${?}"
